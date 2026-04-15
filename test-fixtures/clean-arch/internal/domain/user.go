package domain

// User is a core domain entity. No imports from outer tiers.
type User struct {
	ID    string
	Name  string
	Email string
}

// UserRepository is a port (interface) that infrastructure must implement.
// The domain owns the interface definition — it never knows the implementation.
type UserRepository interface {
	FindByID(id string) (*User, error)
	Save(user *User) error
}
