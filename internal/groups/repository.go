package groups

import (
	"context"
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

type Repository interface {
	Load(ctx context.Context) ([]Group, error)
}

type YAMLRepository struct {
	path string
}

func NewYAMLRepository(path string) *YAMLRepository {
	return &YAMLRepository{path: path}
}

type yamlFile struct {
	Groups []Group `yaml:"groups"`
}

func (r *YAMLRepository) Load(_ context.Context) ([]Group, error) {
	data, err := os.ReadFile(r.path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", r.path, err)
	}
	var doc yamlFile
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("parse %s: %w", r.path, err)
	}
	for i := range doc.Groups {
		doc.Groups[i].Color = strings.TrimSpace(doc.Groups[i].Color)
		for j := range doc.Groups[i].Events {
			doc.Groups[i].Events[j].Country = strings.ToUpper(strings.TrimSpace(doc.Groups[i].Events[j].Country))
		}
	}
	return doc.Groups, nil
}
