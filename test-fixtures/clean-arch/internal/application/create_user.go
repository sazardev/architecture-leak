package application

import "cleanarch/internal/domain"

// CreateUserInput carries the data needed to register a new user.
type CreateUserInput struct {
	Name  string
	Email string
}

// CreateUserUseCase orchestrates user creation.
// It depends only on domain types and the domain-owned repository port.
type CreateUserUseCase struct {
	repo domain.UserRepository
}

func NewCreateUserUseCase(repo domain.UserRepository) *CreateUserUseCase {
	return &CreateUserUseCase{repo: repo}
}

func (uc *CreateUserUseCase) Execute(input CreateUserInput) (*domain.User, error) {
	if err := domain.ValidateEmail(input.Email); err != nil {
		return nil, err
	}

	user := &domain.User{
		ID:    "generated-id",
		Name:  input.Name,
		Email: input.Email,
	}

	if err := uc.repo.Save(user); err != nil {
		return nil, err
	}

	return user, nil
}
