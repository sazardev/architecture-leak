package infrastructure

import "database/sql"

// SQLDatabase wraps a *sql.DB and exposes query helpers.
// This is infrastructure — it's allowed to import domain or application.
type SQLDatabase struct {
	db *sql.DB
}

func NewSQLDatabase(dsn string) (*SQLDatabase, error) {
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}
	return &SQLDatabase{db: db}, nil
}

func (s *SQLDatabase) QueryRow(query string, args ...any) *sql.Row {
	return s.db.QueryRow(query, args...)
}

func (s *SQLDatabase) Exec(query string, args ...any) (sql.Result, error) {
	return s.db.Exec(query, args...)
}
