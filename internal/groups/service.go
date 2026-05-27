package groups

import "context"

type Service struct {
	repo   Repository
	cached []Group
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Preload reads the repository once so requests don't pay the I/O cost
// (and surfaces a malformed locations.yaml at startup, not on the first request).
func (s *Service) Preload(ctx context.Context) error {
	g, err := s.repo.Load(ctx)
	if err != nil {
		return err
	}
	s.cached = g
	return nil
}

func (s *Service) Groups(_ context.Context) ([]Group, error) {
	return s.cached, nil
}
