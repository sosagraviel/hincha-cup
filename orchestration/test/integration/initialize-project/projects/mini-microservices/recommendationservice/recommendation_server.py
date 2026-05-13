"""gRPC entry point for recommendationservice."""
import os
import signal
from concurrent.futures import ThreadPoolExecutor

import grpc

from recommendations import RecommendationEngine


def main() -> None:
    """Start the gRPC server on :8080 (overridable via PORT)."""
    port = os.environ.get("PORT", "8080")
    server = grpc.server(ThreadPoolExecutor(max_workers=10))
    # Real services would register the generated servicer here:
    # demo_pb2_grpc.add_RecommendationServiceServicer_to_server(...)
    server.add_insecure_port(f"[::]:{port}")
    server.start()

    def shutdown(_signum, _frame):
        server.stop(grace=5)

    signal.signal(signal.SIGTERM, shutdown)
    server.wait_for_termination()


if __name__ == "__main__":
    main()
