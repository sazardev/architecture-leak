package infrastructure

import (
	"cleanarch/internal/application"
	"cleanarch/internal/domain"
	"encoding/json"
	"net/http"
)

// HTTPHandler is an HTTP adapter in the infrastructure layer.
// It wires use cases from application layer and returns HTTP responses.
type HTTPHandler struct {
	createUser *application.CreateUserUseCase
	getUser    *application.GetUserUseCase
}

func NewHTTPHandler(create *application.CreateUserUseCase, get *application.GetUserUseCase) *HTTPHandler {
	return &HTTPHandler{createUser: create, getUser: get}
}

func (h *HTTPHandler) HandleGetUser(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	user, err := h.getUser.Execute(id)
	if err != nil {
		if err == domain.ErrUserNotFound {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(user)
}
