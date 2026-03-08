use std::process::Command;
use std::fs;

fn main() {
    let bad_tex = "\\documentclass{garbageclass}\n\\begin{document}\nUnclosed group{ \n\\end{document}";
    
    fs::write("bad.tex", bad_tex).unwrap();
    
    let output = Command::new(".\\tectonic.exe")
        .arg("bad.tex")
        .output()
        .unwrap();
        
    println!("Status: {}", output.status);
    println!("Stdout: {}", String::from_utf8_lossy(&output.stdout));
    println!("Stderr: {}", String::from_utf8_lossy(&output.stderr));
}
