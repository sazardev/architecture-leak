package domain

import (
	// ARCHITECTURE VIOLATION: Domain (Tier 0) directly imports Infrastructure (Tier 2).
	// The domain must be completely isolated — it must never know about databases,
	// HTTP, or any external adapter. This breaks the Dependency Rule.
	"badarch/internal/infrastructure"
)

// User is a domain entity that has been leaked into infrastructure concerns.
type User struct {
	ID    string
	Name  string
	Email string
}

// BadUserService calls infrastructure directly from domain — a classic leak.
type BadUserService struct {
	db *infrastructure.SQLDatabase
}

func NewBadUserService(db *infrastructure.SQLDatabase) *BadUserService {
	return &BadUserService{db: db}
}

func (s *BadUserService) FindUser(id string) (*User, error) {
	row := s.db.QueryRow("SELECT id, name, email FROM users WHERE id = ?", id)
	u := &User{}
	return u, row.Scan(&u.ID, &u.Name, &u.Email)
}
