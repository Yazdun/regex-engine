# Test Data Documentation

This directory contains sample data for testing the grep implementation.

## Directory Structure

```
test_data/
├── README.md          # This documentation file
├── logs/             # Log files with various formats
│   ├── app.log       # Standard application logs
│   └── error.log     # Error and system logs
├── code/             # Source code files
│   ├── main.js       # JavaScript application code
│   └── utils.py      # Python utility functions
└── docs/             # Documentation files
    └── README.md     # Project documentation
```

## File Contents Overview

### Log Files (`logs/`)

#### app.log
- Standard application logs with INFO, DEBUG, WARN, ERROR levels
- Contains timestamps, user activities, system events
- Email addresses, IP addresses, and numeric identifiers
- Mixed log levels for comprehensive testing

#### error.log
- System error logs with ERROR, WARN, FATAL levels
- Different timestamp format (ISO 8601)
- Database errors, network issues, authentication failures
- Security-related events and system crashes

### Code Files (`code/`)

#### main.js
- Express.js application with database connectivity
- User authentication and session management
- API endpoints and error handling
- Comments, variables, and function definitions
- Email validation regex patterns

#### utils.py
- Python utility library with data processing functions
- Class definitions and type hints
- Email validation and statistics calculations
- JSON configuration handling
- Sample data structures

## Testing Scenarios

This test data supports various grep functionality tests:

### Basic Pattern Matching
- Literal string searches
- Case-sensitive/insensitive matching
- Word boundaries and exact matches

### Regular Expressions
- Character classes `[0-9]`, `[a-zA-Z]`
- Quantifiers `*`, `+`, `?`
- Anchors `^` (start of line), `$` (end of line)
- Dot `.` wildcard matching
- Word `\w` and digit `\d` character classes

### Advanced Features
- Alternation patterns with `|`
- Grouping with parentheses `()`
- Backreferences `\1`, `\2`, etc.
- Character group negation `[^...]`

### File Operations
- Single file search
- Multiple file search
- Recursive directory search with `-r` flag
- Standard input processing

## Sample Test Commands

The test data is designed to demonstrate:

1. **Log Analysis**: Finding specific log levels, timestamps, or error patterns
2. **Code Search**: Locating functions, variables, comments, or specific syntax
3. **Data Validation**: Testing email formats, numeric patterns, or structured data
4. **Complex Patterns**: Multi-line matching, backreferences, and alternation

## File Formats

- **Text Files**: Plain text with various encoding (UTF-8)
- **Log Files**: Structured logs with timestamps and severity levels
- **Source Code**: JavaScript and Python with syntax highlighting support
- **Documentation**: Markdown formatted text

## Usage Notes

- All files contain realistic, production-like data patterns
- Email addresses and IP addresses are fictional for testing purposes
- Timestamps follow common logging formats
- Code samples include both commented and uncommented sections
- Various line endings and spacing patterns for edge case testing

This test suite provides comprehensive coverage for grep functionality testing and demonstration.
