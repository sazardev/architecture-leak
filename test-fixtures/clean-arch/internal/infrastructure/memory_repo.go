package infrastructure

import (
	"cleanarch/internal/domain"
	"fmt"
)

// InMemoryUserRepository is an in-memory adapter that satisfies domain.UserRepository.
// Infrastructure is free to import from both domain and application.
type InMemoryUserRepository struct {
	store map[string]*domain.User
}

func NewInMemoryUserRepository() *InMemoryUserRepository {
	return &InMemoryUserRepository{store: make(map[string]*domain.User)}
}

func (r *InMemoryUserRepository) FindByID(id string) (*domain.User, error) {
	if u, ok := r.store[id]; ok {
		return u, nil
	}
	return nil, fmt.Errorf("user %q not found in store", id)
}

func (r *InMemoryUserRepository) Save(user *domain.User) error {
	if user == nil {
		return fmt.Errorf("cannot save nil user")
	}
	r.store[user.ID] = user
	return nil
}
