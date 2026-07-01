/// Split a file name into stem and extension. The extension includes the leading dot.
pub fn split_stem_extension(file_name: &str) -> (&str, &str) {
    match file_name.rfind('.') {
        Some(index) if index > 0 => (&file_name[..index], &file_name[index..]),
        _ => (file_name, ""),
    }
}

#[cfg(test)]
mod tests {
    use super::split_stem_extension;

    #[test]
    fn split_stem_extension_preserves_multi_part_extensions() {
        assert_eq!(split_stem_extension("Archive.tar.gz"), ("Archive.tar", ".gz"));
    }

    #[test]
    fn split_stem_extension_handles_names_without_extension() {
        assert_eq!(split_stem_extension("Todo"), ("Todo", ""));
    }
}
