use std::net::{IpAddr, ToSocketAddrs};

use url::Url;

fn is_forbidden_v4(v4: std::net::Ipv4Addr) -> bool {
    v4.is_private()
        || v4.is_loopback()
        || v4.is_link_local()
        || v4.is_broadcast()
        || v4.is_documentation()
        || v4.is_unspecified()
        || v4.is_multicast()
}

fn is_forbidden_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_forbidden_v4(v4),
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unicast_link_local()
                || v6.is_unique_local()
                || v6.is_unspecified()
                || v6.is_multicast()
                // IPv4-mapped IPv6 addresses (::ffff:x.x.x.x) can bypass the
                // IPv6-only checks above because e.g. ::ffff:127.0.0.1 is not
                // considered loopback by Ipv6Addr::is_loopback(). Unwrap the
                // inner IPv4 address and apply the same private-range checks.
                || v6.to_ipv4_mapped().is_some_and(|v4| is_forbidden_v4(v4))
        }
    }
}

pub fn validate_url_host(url: &Url, allow_private_hosts: bool) -> Result<(), String> {
    if allow_private_hosts {
        return Ok(());
    }

    let host = url
        .host_str()
        .ok_or_else(|| "invalid url host".to_string())?;
    if host.eq_ignore_ascii_case("localhost") {
        return Err("forbidden host".to_string());
    }

    // If the host is an IP literal, block private/loopback/etc directly.
    // url::Url::host_str() returns IPv6 addresses wrapped in brackets
    // (e.g. "[::1]"), so strip them before parsing.
    let ip_candidate = host
        .strip_prefix('[')
        .and_then(|s| s.strip_suffix(']'))
        .unwrap_or(host);
    if let Ok(ip) = ip_candidate.parse::<IpAddr>() {
        if is_forbidden_ip(ip) {
            return Err("forbidden host".to_string());
        }
        return Ok(());
    }

    // Best-effort DNS check to avoid obvious SSRF to private ranges.
    let port = match url.scheme() {
        "http" => 80,
        "https" => 443,
        _ => return Err("only http(s) urls are allowed".to_string()),
    };
    let addrs: Vec<IpAddr> = (host, port)
        .to_socket_addrs()
        .map_err(|_| "dns lookup failed".to_string())?
        .map(|a| a.ip())
        .collect();
    if addrs.is_empty() {
        return Err("dns lookup failed".to_string());
    }
    if addrs.into_iter().any(is_forbidden_ip) {
        return Err("forbidden host".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(url_str: &str) -> Result<(), String> {
        let url = Url::parse(url_str).unwrap();
        validate_url_host(&url, false)
    }

    #[test]
    fn public_ip_allowed() {
        assert!(check("https://93.184.216.34/").is_ok());
    }

    #[test]
    fn loopback_v4_blocked() {
        assert!(check("http://127.0.0.1/").is_err());
    }

    #[test]
    fn private_v4_blocked() {
        assert!(check("http://10.0.0.1/").is_err());
        assert!(check("http://192.168.1.1/").is_err());
        assert!(check("http://172.16.0.1/").is_err());
    }

    #[test]
    fn loopback_v6_blocked() {
        assert!(check("http://[::1]/").is_err());
    }

    #[test]
    fn mapped_loopback_blocked() {
        // ::ffff:127.0.0.1 is an IPv4-mapped IPv6 address that wraps loopback.
        assert!(check("http://[::ffff:127.0.0.1]/").is_err());
    }

    #[test]
    fn mapped_private_blocked() {
        assert!(check("http://[::ffff:10.0.0.1]/").is_err());
        assert!(check("http://[::ffff:192.168.1.1]/").is_err());
        assert!(check("http://[::ffff:172.16.0.1]/").is_err());
    }

    #[test]
    fn mapped_public_allowed() {
        // ::ffff:93.184.216.34 wraps a public IPv4 — should be allowed.
        assert!(check("http://[::ffff:93.184.216.34]/").is_ok());
    }

    #[test]
    fn localhost_string_blocked() {
        assert!(check("http://localhost/").is_err());
        assert!(check("http://LOCALHOST/").is_err());
    }

    #[test]
    fn allow_private_hosts_flag() {
        let url = Url::parse("http://127.0.0.1/").unwrap();
        assert!(validate_url_host(&url, true).is_ok());
    }
}
