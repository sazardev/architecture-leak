package application

import (
	"badarch/internal/domain"
	// ARCHITECTURE VIOLATION: Application (Tier 1) directly imports Infrastructure (Tier 2).
	// Application layer is only allowed to depend on Domain (Tier 0). It must use
	// interfaces (ports) defined in the domain, NOT concrete infrastructure types.
	"badarch/internal/infrastructure"
)

// CreateUserUseCase is polluted by infrastructure knowledge.
type CreateUserUseCase struct {
	db *infrastructure.SQLDatabase // wrong: should be domain.UserRepository interface
}

func NewCreateUserUseCase(db *infrastructure.SQLDatabase) *CreateUserUseCase {
	return &CreateUserUseCase{db: db}
}

func (uc *CreateUserUseCase) Execute(name, email string) (*domain.User, error) {
	user := &domain.User{ID: "new-id", Name: name, Email: email}
	_, err := uc.db.Exec("INSERT INTO users(id,name,email) VALUES(?,?,?)", user.ID, user.Name, user.Email)
	return user, err
}
