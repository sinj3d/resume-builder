$env:CMAKE = "C:\Program Files\CMake\bin\cmake.exe"
$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
$env:PATH = "C:\Program Files\CMake\bin;" + $env:PATH

cargo test -- --nocapture 2>&1
