package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/umarquez/interactive-map-demo/internal/groups"
	"github.com/umarquez/interactive-map-demo/internal/httpapi"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	rootDir := flag.String("root", ".", "project root (contains index.html and assets/)")
	dataFile := flag.String("data", "locations.yaml", "path to locations.yaml")
	flag.Parse()

	absRoot, err := filepath.Abs(*rootDir)
	if err != nil {
		log.Fatalf("resolve root: %v", err)
	}
	absData := *dataFile
	if !filepath.IsAbs(absData) {
		absData = filepath.Join(absRoot, *dataFile)
	}

	repo := groups.NewYAMLRepository(absData)
	svc := groups.NewService(repo)
	if err := svc.Preload(context.Background()); err != nil {
		log.Fatalf("load %s: %v", absData, err)
	}

	server := httpapi.NewServer(httpapi.Config{
		Addr:      *addr,
		RootDir:   absRoot,
		AssetsDir: filepath.Join(absRoot, "assets"),
	}, httpapi.NewGroupsHandler(svc))

	go func() {
		log.Printf("listening on %s (root=%s data=%s)", *addr, absRoot, absData)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Println("shutting down")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
