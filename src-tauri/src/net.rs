use std::net::{IpAddr, ToSocketAddrs};

use url::Url;

fn is_forbidden_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_unspecified()
                || v4.is_multicast()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unicast_link_local()
                || v6.is_unique_local()
                || v6.is_unspecified()
                || v6.is_multicast()
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
    if let Ok(ip) = host.parse::<IpAddr>() {
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
