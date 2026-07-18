"""Merge the LoRA adapter into the base model → out/merged/ (HF format).

GGUF conversion happens afterwards with llama.cpp tooling — see the printed
instructions or training/README.md. The conversion embeds Qwen's ChatML chat
template into the GGUF metadata, which is exactly what the app reads at
inference (llm/mod.rs, model.chat_template(None)).
"""
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

import config

LORA_DIR = config.OUT_DIR / "lora"
MERGED_DIR = config.OUT_DIR / "merged"


def main() -> None:
    if not LORA_DIR.exists():
        raise SystemExit(f"{LORA_DIR} missing — run train.py first.")

    print(f"Loading base model {config.BASE_MODEL} (bf16, CPU)...")
    base = AutoModelForCausalLM.from_pretrained(
        config.BASE_MODEL, torch_dtype=torch.bfloat16, device_map="cpu")
    model = PeftModel.from_pretrained(base, str(LORA_DIR))
    print("Merging adapter...")
    model = model.merge_and_unload()

    MERGED_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(MERGED_DIR))
    AutoTokenizer.from_pretrained(config.BASE_MODEL).save_pretrained(str(MERGED_DIR))
    print(f"Merged model saved to {MERGED_DIR}")

    print(f"""
Next — convert to GGUF and quantize (see README.md):

  git clone --depth 1 https://github.com/ggml-org/llama.cpp
  pip install -r llama.cpp/requirements/requirements-convert_hf_to_gguf.txt
  python llama.cpp/convert_hf_to_gguf.py {MERGED_DIR} --outfile {config.OUT_DIR / 'coverletter-f16.gguf'} --outtype f16

  # download llama-bXXXX-bin-win-cpu-x64.zip from llama.cpp GitHub releases, then:
  llama-quantize.exe {config.OUT_DIR / 'coverletter-f16.gguf'} {config.OUT_DIR / 'coverletter-Q4_K_M.gguf'} Q4_K_M

Finally paste the Q4_K_M path into the app: Settings -> Local (GGUF).
""")


if __name__ == "__main__":
    main()
