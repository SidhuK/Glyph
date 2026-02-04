const KEYCHAIN_SERVICE: &str = "Tether AI";

pub fn keychain_entry(profile_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, profile_id).map_err(|e| e.to_string())
}

pub fn keychain_set(profile_id: &str, secret: &str) -> Result<(), String> {
    let entry = keychain_entry(profile_id)?;
    entry.set_password(secret).map_err(|e| e.to_string())
}

pub fn keychain_get(profile_id: &str) -> Result<Option<String>, String> {
    let entry = keychain_entry(profile_id)?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn keychain_clear(profile_id: &str) -> Result<(), String> {
    let entry = keychain_entry(profile_id)?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
