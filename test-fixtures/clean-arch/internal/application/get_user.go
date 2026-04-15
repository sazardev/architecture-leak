package application

import "cleanarch/internal/domain"

// GetUserUseCase retrieves a user by ID.
// Only depends on domain — no infrastructure knowledge here.
type GetUserUseCase struct {
	repo domain.UserRepository
}

func NewGetUserUseCase(repo domain.UserRepository) *GetUserUseCase {
	return &GetUserUseCase{repo: repo}
}

func (uc *GetUserUseCase) Execute(id string) (*domain.User, error) {
	user, err := uc.repo.FindByID(id)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, domain.ErrUserNotFound
	}
	return user, nil
}
