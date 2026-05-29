// gRPC server entry point.
const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const pino = require('pino');

const { charge } = require('./charge');
const logger = require('./logger');

const PROTO_PATH = path.join(__dirname, '..', 'pb', 'demo.proto');
const PORT = process.env.PORT || 50051;

function loadServiceDefinition() {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const descriptor = grpc.loadPackageDefinition(packageDefinition);
  return descriptor.mini_microservices.PaymentService.service;
}

function main() {
  const server = new grpc.Server();
  server.addService(loadServiceDefinition(), {
    Charge: (call, callback) => {
      try {
        const result = charge(call.request);
        callback(null, result);
      } catch (err) {
        logger.error({ err: err.message }, 'charge failed');
        callback({ code: grpc.status.INVALID_ARGUMENT, message: err.message });
      }
    },
  });

  server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), () => {
    logger.info(`paymentservice listening on :${PORT}`);
    server.start();
  });
}

if (require.main === module) {
  main();
}

module.exports = { loadServiceDefinition };
