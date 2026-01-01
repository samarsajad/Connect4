require("dotenv").config();

const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "connect4-server",
  brokers: ["localhost:9092"]
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
if (!process.env.KAFKA_BROKERS) {
  console.log("Kafka disabled (no brokers configured)");
  module.exports.emitEvent = async () => {};
  return;
}


module.exports = {
  connectProducer,
  emitEvent
};
