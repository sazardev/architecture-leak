package domain

import "errors"

// DomainError represents a business-rule violation.
type DomainError struct {
	Code    string
	Message string
}

func (e *DomainError) Error() string {
	return e.Message
}

// ErrUserNotFound is returned when a requested user does not exist.
var ErrUserNotFound = errors.New("user not found")

// ValidateEmail checks basic email format — pure domain logic, no I/O.
func ValidateEmail(email string) error {
	if len(email) == 0 {
		return &DomainError{Code: "EMPTY_EMAIL", Message: "email must not be empty"}
	}
	for _, ch := range email {
		if ch == '@' {
			return nil
		}
	}
	return &DomainError{Code: "INVALID_EMAIL", Message: "email must contain @"}
}
