#!/usr/bin/env bash
# Regenerate gRPC stubs across every language from pb/demo.proto.
set -euo pipefail

PROTO=pb/demo.proto

# Go
protoc --go_out=frontend --go-grpc_out=frontend "$PROTO"
protoc --go_out=productcatalogservice --go-grpc_out=productcatalogservice "$PROTO"

# Python
python3 -m grpc_tools.protoc -I pb \
  --python_out=recommendationservice \
  --grpc_python_out=recommendationservice "$PROTO"

# Node (JS)
grpc_tools_node_protoc \
  --js_out=import_style=commonjs:paymentservice \
  --grpc_out=grpc_js:paymentservice -I pb "$PROTO"

# .NET — usually done via <Protobuf Include="..." /> in the csproj
echo "(cartservice picks up the .proto via Protobuf Include in cartservice.csproj)"

echo "stubs regenerated"
