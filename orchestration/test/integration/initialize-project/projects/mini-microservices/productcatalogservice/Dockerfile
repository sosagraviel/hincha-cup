# syntax=docker/dockerfile:1.6
FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/productcatalog ./...

FROM gcr.io/distroless/static-debian12 AS runtime
COPY --from=builder /out/productcatalog /productcatalog
COPY products.json /products.json
EXPOSE 7000
ENTRYPOINT ["/productcatalog"]
