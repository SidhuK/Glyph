use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, ToSocketAddrs};

use url::Url;

fn is_forbidden_v4(v4: Ipv4Addr) -> bool {
    v4.is_private()
        || v4.is_loopback()
        || v4.is_link_local()
        || v4.is_broadcast()
        || v4.is_documentation()
        || v4.is_unspecified()
        || v4.is_multicast()
}

fn embedded_6to4_v4(v6: Ipv6Addr) -> Option<Ipv4Addr> {
    let octets = v6.octets();
    if octets[0] == 0x20 && octets[1] == 0x02 {
        return Some(Ipv4Addr::new(octets[2], octets[3], octets[4], octets[5]));
    }
    None
}

fn embedded_nat64_well_known_v4(v6: Ipv6Addr) -> Option<Ipv4Addr> {
    let octets = v6.octets();
    if octets[..12] == [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0] {
        return Some(Ipv4Addr::new(
            octets[12], octets[13], octets[14], octets[15],
        ));
    }
    None
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
                || embedded_6to4_v4(v6).is_some_and(|v4| is_forbidden_v4(v4))
                || embedded_nat64_well_known_v4(v6).is_some_and(|v4| is_forbidden_v4(v4))
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
    fn six_to_four_private_blocked() {
        assert!(check("http://[2002:7f00:0001::]/").is_err());
        assert!(check("http://[2002:0a00:0001::]/").is_err());
    }

    #[test]
    fn six_to_four_public_allowed() {
        assert!(check("http://[2002:5db8:d822::]/").is_ok());
    }

    #[test]
    fn nat64_well_known_private_blocked() {
        assert!(check("http://[64:ff9b::7f00:1]/").is_err());
        assert!(check("http://[64:ff9b::a00:1]/").is_err());
    }

    #[test]
    fn nat64_well_known_public_allowed() {
        assert!(check("http://[64:ff9b::5db8:d822]/").is_ok());
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
