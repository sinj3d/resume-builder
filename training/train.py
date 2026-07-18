"""QLoRA fine-tune of the student model on the distillation dataset.

Native Windows stack: transformers + peft + bitsandbytes + plain Trainer with
manual completion-masking (loss only on assistant tokens). No TRL, no Unsloth.

Usage:
    python train.py             # full run (~<2h on a 16 GB GPU)
    python train.py --smoke     # 5 optimizer steps to validate the setup
"""
import json
import sys

import torch
from datasets import Dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    DataCollatorForSeq2Seq,
    Trainer,
    TrainingArguments,
)

import config

SMOKE = "--smoke" in sys.argv


def load_split(name: str) -> Dataset:
    path = config.DATA_DIR / name
    rows = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l]
    return Dataset.from_list([{"messages": r["messages"]} for r in rows])


def make_tokenize_fn(tokenizer):
    def tokenize(example):
        messages = example["messages"]
        # Prompt = system+user with the generation header appended — exactly what
        # the app feeds the model at inference (chat template, add_ass=true).
        # Split at the STRING level (guaranteed prefix by template structure),
        # then tokenize the two halves separately: token-level prefixes are NOT
        # guaranteed (BPE can merge across the seam), but this way the
        # completion-mask boundary is exact and the prompt tokens match
        # inference byte-for-byte.
        prompt_text = tokenizer.apply_chat_template(
            messages[:-1], add_generation_prompt=True, tokenize=False)
        full_text = tokenizer.apply_chat_template(
            messages, add_generation_prompt=False, tokenize=False)
        assert full_text.startswith(prompt_text), \
            "chat template: prompt text is not a prefix of the full conversation"
        prompt_ids = tokenizer(prompt_text, add_special_tokens=False).input_ids
        completion_ids = tokenizer(full_text[len(prompt_text):],
                                   add_special_tokens=False).input_ids
        input_ids = prompt_ids + completion_ids
        labels = [-100] * len(prompt_ids) + completion_ids
        return {"input_ids": input_ids, "labels": labels,
                "attention_mask": [1] * len(input_ids)}
    return tokenize


def main() -> None:
    tokenizer = AutoTokenizer.from_pretrained(config.BASE_MODEL)

    model = AutoModelForCausalLM.from_pretrained(
        config.BASE_MODEL,
        quantization_config=BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.bfloat16,
        ),
        attn_implementation="sdpa",
        device_map="auto",
    )
    model = prepare_model_for_kbit_training(model)
    model = get_peft_model(model, LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
    ))
    model.print_trainable_parameters()
    model.config.use_cache = False

    tokenize = make_tokenize_fn(tokenizer)
    train_ds = load_split("train.jsonl").map(tokenize, remove_columns=["messages"])
    val_ds = load_split("val.jsonl").map(tokenize, remove_columns=["messages"])

    before = len(train_ds)
    train_ds = train_ds.filter(lambda ex: len(ex["input_ids"]) <= config.MAX_SEQ_LEN)
    val_ds = val_ds.filter(lambda ex: len(ex["input_ids"]) <= config.MAX_SEQ_LEN)
    if before != len(train_ds):
        print(f"Dropped {before - len(train_ds)} over-length examples (> {config.MAX_SEQ_LEN} tokens)")

    args = TrainingArguments(
        output_dir=str(config.OUT_DIR / "checkpoints"),
        num_train_epochs=3,
        max_steps=5 if SMOKE else -1,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=8,     # effective batch 16
        learning_rate=2e-4,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        bf16=True,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        optim="paged_adamw_8bit",
        logging_steps=5,
        eval_strategy="no" if SMOKE else "epoch",
        save_strategy="no" if SMOKE else "epoch",
        load_best_model_at_end=not SMOKE,
        metric_for_best_model="eval_loss",
        report_to=[],
        seed=config.SEED,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=None if SMOKE else val_ds,
        data_collator=DataCollatorForSeq2Seq(tokenizer, label_pad_token_id=-100),
    )
    trainer.train()

    lora_dir = config.OUT_DIR / "lora"
    model.save_pretrained(str(lora_dir))
    tokenizer.save_pretrained(str(lora_dir))
    print(f"{'Smoke run OK' if SMOKE else 'Training done'} — adapter saved to {lora_dir}")


if __name__ == "__main__":
    main()
