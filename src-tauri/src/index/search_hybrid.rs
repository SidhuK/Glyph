use std::collections::{HashMap, HashSet};

use rusqlite::Connection;

use super::types::SearchResult;

const CANDIDATE_LIMIT: i64 = 300;

fn tokenize_query(query: &str) -> Vec<String> {
    query
        .split(|c: char| !c.is_alphanumeric())
        .map(str::trim)
        .filter(|t| t.len() >= 2)
        .map(|t| t.to_lowercase())
        .collect()
}

fn trigrams(s: &str) -> HashSet<[char; 3]> {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() < 3 {
        return HashSet::new();
    }
    let mut out = HashSet::new();
    for i in 0..(chars.len() - 2) {
        out.insert([chars[i], chars[i + 1], chars[i + 2]]);
    }
    out
}

fn jaccard_trigram(a: &str, b: &str) -> f64 {
    let ta = trigrams(a);
    let tb = trigrams(b);
    if ta.is_empty() || tb.is_empty() {
        return 0.0;
    }
    let inter = ta.intersection(&tb).count() as f64;
    let union = ta.union(&tb).count() as f64;
    if union <= 0.0 {
        0.0
    } else {
        inter / union
    }
}

fn semantic_score(query_lc: &str, terms: &[String], title: &str, preview: &str) -> f64 {
    let title_lc = title.to_lowercase();
    let preview_lc = preview.to_lowercase();
    let text = format!("{title_lc} {preview_lc}");

    let mut matched = 0usize;
    for t in terms {
        if text.contains(t) {
            matched += 1;
        }
    }
    let overlap = if terms.is_empty() {
        0.0
    } else {
        matched as f64 / terms.len() as f64
    };

    let tri = jaccard_trigram(query_lc, &text);
    let phrase_bonus = if text.contains(query_lc) { 0.2 } else { 0.0 };
    let title_bonus = if title_lc.contains(query_lc) {
        0.1
    } else {
        0.0
    };

    (0.6 * overlap) + (0.4 * tri) + phrase_bonus + title_bonus
}

fn keyword_search(
    conn: &Connection,
    query: &str,
    tags: &[String],
    limit: i64,
) -> Result<Vec<SearchResult>, String> {
    let mut sql = String::from(
        "SELECT notes_fts.id, notes_fts.title,
                snippet(notes_fts, 2, '⟦', '⟧', '…', 10) AS snip,
                bm25(notes_fts) AS score
         FROM notes_fts ",
    );
    for i in 0..tags.len() {
        sql.push_str(&format!(
            "JOIN tags t{idx} ON t{idx}.note_id = notes_fts.id AND t{idx}.tag = ? ",
            idx = i
        ));
    }
    sql.push_str("WHERE notes_fts MATCH ? ORDER BY score LIMIT ?");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut params: Vec<rusqlite::types::Value> = tags
        .iter()
        .map(|t| rusqlite::types::Value::from(t.clone()))
        .collect();
    params.push(rusqlite::types::Value::from(query.to_string()));
    params.push(rusqlite::types::Value::from(limit));

    let mut rows = stmt
        .query(rusqlite::params_from_iter(params.iter()))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        out.push(SearchResult {
            id: row.get(0).map_err(|e| e.to_string())?,
            title: row.get(1).map_err(|e| e.to_string())?,
            snippet: row.get(2).map_err(|e| e.to_string())?,
            score: row.get(3).map_err(|e| e.to_string())?,
        });
    }
    Ok(out)
}

fn semantic_candidates(
    conn: &Connection,
    terms: &[String],
    tags: &[String],
) -> Result<Vec<(String, String, String)>, String> {
    let mut sql = String::from("SELECT n.id, n.title, n.preview FROM notes n ");
    for i in 0..tags.len() {
        sql.push_str(&format!(
            "JOIN tags t{idx} ON t{idx}.note_id = n.id AND t{idx}.tag = ? ",
            idx = i
        ));
    }
    if !terms.is_empty() {
        sql.push_str("WHERE ");
        for (i, _) in terms.iter().enumerate() {
            if i > 0 {
                sql.push_str(" OR ");
            }
            sql.push_str("lower(n.title) LIKE ? OR lower(n.preview) LIKE ?");
        }
        sql.push(' ');
    }
    sql.push_str("ORDER BY n.updated DESC LIMIT ?");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut params: Vec<rusqlite::types::Value> = tags
        .iter()
        .map(|t| rusqlite::types::Value::from(t.clone()))
        .collect();
    for t in terms {
        let like = format!("%{t}%");
        params.push(rusqlite::types::Value::from(like.clone()));
        params.push(rusqlite::types::Value::from(like));
    }
    params.push(rusqlite::types::Value::from(CANDIDATE_LIMIT));

    let mut rows = stmt
        .query(rusqlite::params_from_iter(params.iter()))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        out.push((
            row.get(0).map_err(|e| e.to_string())?,
            row.get(1).map_err(|e| e.to_string())?,
            row.get(2).map_err(|e| e.to_string())?,
        ));
    }
    Ok(out)
}

pub fn hybrid_search(
    conn: &Connection,
    query: &str,
    tags: &[String],
    limit: i64,
) -> Result<Vec<SearchResult>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let q_lc = q.to_lowercase();
    let terms = tokenize_query(&q_lc);

    let keyword = keyword_search(conn, q, tags, limit.max(50)).unwrap_or_default();
    let candidates = semantic_candidates(conn, &terms, tags)?;

    let mut ranked: HashMap<String, SearchResult> = HashMap::new();
    let keyword_len = keyword.len().max(1) as f64;
    for (idx, r) in keyword.into_iter().enumerate() {
        let rank_score = 1.0 - (idx as f64 / keyword_len);
        ranked.insert(
            r.id.clone(),
            SearchResult {
                score: 0.7 * rank_score,
                ..r
            },
        );
    }

    for (id, title, preview) in candidates {
        let sem = semantic_score(&q_lc, &terms, &title, &preview);
        if sem <= 0.0 {
            continue;
        }
        let entry = ranked.entry(id.clone()).or_insert_with(|| SearchResult {
            id,
            title,
            snippet: preview,
            score: 0.0,
        });
        entry.score += 0.5 * sem;
    }

    let mut out: Vec<SearchResult> = ranked.into_values().collect();
    out.sort_by(|a, b| b.score.total_cmp(&a.score));
    out.truncate(limit.max(1) as usize);
    Ok(out)
}
