# syntax=docker/dockerfile:1.7
# Multi-stage build: compile in golang:alpine, run in a minimal alpine image.

FROM golang:1.25-alpine AS builder

WORKDIR /src

# Cache module downloads across rebuilds when go.mod/go.sum don't change.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .

# Static binary so the runtime image needs no glibc/libc. -trimpath strips the
# build path; -s -w drops the symbol/debug info to shrink the binary.
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=0 GOOS=linux go build \
        -trimpath -ldflags="-s -w" \
        -o /out/dynamic-map ./cmd/app


FROM alpine:3.20

# wget is used by the HEALTHCHECK; tini reaps zombies and forwards signals
# so docker stop cleanly triggers the Go shutdown handler.
RUN apk add --no-cache ca-certificates wget tini \
 && addgroup -S app \
 && adduser -S -G app app

WORKDIR /app
COPY --from=builder /out/dynamic-map /app/dynamic-map
COPY --chown=app:app index.html      /app/index.html
COPY --chown=app:app assets          /app/assets
COPY --chown=app:app locations.yaml  /app/locations.yaml

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/api/v1/groups >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/app/dynamic-map"]
