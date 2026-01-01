require("dotenv").config();

// Early exit if Kafka is not configured
if (!process.env.KAFKA_BROKERS) {
  console.log("Kafka disabled (no brokers configured)");
  module.exports = {
    connectProducer: async () => {},
    emitEvent: async () => {}
  };
  return;
}

const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "connect4-server",
  brokers: process.env.KAFKA_BROKERS.split(",")
});

const producer = kafka.producer();

async function connectProducer() {
  await producer.connect();
  console.log("Kafka producer connected");
}

async function emitEvent(type, payload) {
  await producer.send({
    topic: "game-events",
    messages: [
      {
        value: JSON.stringify({
          type,
          payload,
          timestamp: Date.now()
        })
      }
    ]
  });
}

module.exports = {
  connectProducer,
  emitEvent
};
