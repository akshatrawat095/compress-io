#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // This boots up the app by calling your lib.rs file
    universal_compressor_lib::run();
}