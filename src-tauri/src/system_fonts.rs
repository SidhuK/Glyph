use std::collections::BTreeSet;

#[cfg(target_os = "macos")]
use core_text::{
    font::new_from_name, font_collection::get_family_names, font_descriptor::SymbolicTraitAccessors,
};

#[cfg(target_os = "macos")]
pub fn list_system_font_families() -> Result<Vec<String>, String> {
    let mut families = BTreeSet::new();

    let names = get_family_names();
    for name in names.iter() {
        let owned = name.to_string();
        let trimmed = owned.trim();
        if trimmed.is_empty() {
            continue;
        }
        families.insert(trimmed.to_string());
    }

    Ok(families.into_iter().collect())
}

#[cfg(target_os = "macos")]
pub fn list_monospace_font_families() -> Result<Vec<String>, String> {
    let mut families = BTreeSet::new();

    let names = get_family_names();
    for name in names.iter() {
        let owned = name.to_string();
        let trimmed = owned.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Ok(font) = new_from_name(trimmed, 12.0) {
            if font.symbolic_traits().is_monospace() {
                families.insert(trimmed.to_string());
            }
        }
    }

    Ok(families.into_iter().collect())
}

#[cfg(not(target_os = "macos"))]
pub fn list_system_font_families() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[cfg(not(target_os = "macos"))]
pub fn list_monospace_font_families() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}
