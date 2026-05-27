package groups

type Group struct {
	ID     string  `yaml:"id" json:"id"`
	Name   string  `yaml:"name" json:"name"`
	Color  string  `yaml:"color" json:"color"`
	Events []Event `yaml:"events" json:"events"`
}

type Event struct {
	Title       string   `yaml:"title" json:"title"`
	Description string   `yaml:"description" json:"description"`
	Country     string   `yaml:"country" json:"country"`
	Lat         *float64 `yaml:"lat,omitempty" json:"lat,omitempty"`
	Lng         *float64 `yaml:"lng,omitempty" json:"lng,omitempty"`
}
