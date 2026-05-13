# syntax=docker/dockerfile:1.6
FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/frontend ./...

FROM gcr.io/distroless/static-debian12 AS runtime
COPY --from=builder /out/frontend /frontend
EXPOSE 8080
ENTRYPOINT ["/frontend"]
