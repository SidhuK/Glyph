//! Precise search expressions share one parser between the palette and saved collections.
mod predicates;

use rusqlite::types::Value;

#[derive(Debug, PartialEq)]
enum Token {
    Term(String, bool),
    And,
    Or,
    Open,
    Close,
}

const MAX_QUERY_BYTES: usize = 16_384;
const MAX_QUERY_TOKENS: usize = 256;

fn tokenize(raw: &str) -> Result<Vec<Token>, String> {
    if raw.len() > MAX_QUERY_BYTES {
        return Err("Search is too long".to_string());
    }
    let mut tokens = Vec::new();
    let mut chars = raw.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch.is_whitespace() {
            continue;
        }
        if tokens.len() >= MAX_QUERY_TOKENS {
            return Err("Search has too many terms".to_string());
        }
        if ch == '(' || ch == ')' {
            tokens.push(if ch == '(' { Token::Open } else { Token::Close });
            continue;
        }
        let literal = ch == '"';
        let mut quoted = literal;
        let mut had_quotes = literal;
        let mut word = String::new();
        if !literal {
            word.push(ch);
        }
        while let Some(&next) = chars.peek() {
            if !quoted && (next.is_whitespace() || next == '(' || next == ')') {
                break;
            }
            chars.next();
            if next == '"' {
                quoted = !quoted;
                had_quotes = true;
            } else if next == '\\' && quoted && matches!(chars.peek(), Some('"' | '\\')) {
                if let Some(escaped) = chars.next() {
                    word.push(escaped);
                }
            } else {
                word.push(next);
            }
        }
        if quoted || word.is_empty() {
            return Err("Search contains an empty term or an unclosed quote".to_string());
        }
        tokens.push(match word.as_str() {
            "AND" if !had_quotes => Token::And,
            "OR" if !had_quotes => Token::Or,
            _ => Token::Term(word, literal),
        });
    }
    Ok(tokens)
}

pub(super) fn is_expression(raw: &str) -> bool {
    // Malformed syntax must reach the parser so it cannot silently become a broad search.
    let Ok(tokens) = tokenize(raw) else {
        return true;
    };
    tokens.iter().any(|token| match token {
        Token::Term(value, false) => {
            let lower = value.to_lowercase();
            ["folder:", "created:", "updated:", "property:", "has:", "missing:", "text:"]
                .iter().any(|prefix| lower.starts_with(prefix))
                || (lower.starts_with("title:") && lower != "title:only")
        }
        Token::Term(_, true) => false,
        _ => true,
    })
}

pub(super) fn compile(raw: &str) -> Result<(String, Vec<Value>), String> {
    let tokens = tokenize(raw)?;
    let mut parser = Parser {
        tokens: &tokens,
        position: 0,
        params: Vec::new(),
    };
    let sql = parser.group(0, Scope::Text)?;
    if parser.position != tokens.len() {
        return Err("Search contains an unexpected closing parenthesis".to_string());
    }
    Ok((sql, parser.params))
}

#[derive(Clone, Copy, PartialEq)]
enum Scope {
    Text,
    Title,
    Tag,
}

struct Parser<'a> {
    tokens: &'a [Token],
    position: usize,
    params: Vec<Value>,
}

impl Parser<'_> {
    // AND binds more tightly than OR. Adjacent terms imply AND.
    fn group(&mut self, depth: usize, scope: Scope) -> Result<String, String> {
        if depth > 16 {
            return Err("Search groups are nested too deeply".to_string());
        }
        let mut alternatives = vec![self.conjunction(depth, scope)?];
        while self.tokens.get(self.position) == Some(&Token::Or) {
            self.position += 1;
            alternatives.push(self.conjunction(depth, scope)?);
        }
        Ok(format!("({})", alternatives.join(" OR ")))
    }

    fn conjunction(&mut self, depth: usize, mut scope: Scope) -> Result<String, String> {
        let mut terms = Vec::new();
        loop {
            // Scope modifiers apply to their branch and nested groups, never sibling OR branches.
            while let Some(Token::Term(value, false)) = self.tokens.get(self.position) {
                scope = if value.eq_ignore_ascii_case("title:only") {
                    Scope::Title
                } else if value.eq_ignore_ascii_case("tag:only") {
                    Scope::Tag
                } else {
                    break;
                };
                self.position += 1;
            }
            terms.push(self.term(depth, scope)?);
            match self.tokens.get(self.position) {
                None | Some(Token::Close | Token::Or) => break,
                Some(Token::And) => self.position += 1,
                _ => {}
            }
        }
        Ok(format!("({})", terms.join(" AND ")))
    }

    fn term(&mut self, depth: usize, scope: Scope) -> Result<String, String> {
        let token = self.tokens.get(self.position);
        self.position += 1;
        match token {
            Some(Token::Open) => {
                let sql = self.group(depth + 1, scope)?;
                if self.tokens.get(self.position) != Some(&Token::Close) {
                    return Err("Search group needs a closing parenthesis".to_string());
                }
                self.position += 1;
                Ok(sql)
            }
            Some(Token::Term(value, literal)) => predicates::compile_term(
                value,
                *literal,
                scope,
                &mut self.params,
            ),
            _ => Err("Search needs a term on each side of AND or OR".to_string()),
        }
    }
}
