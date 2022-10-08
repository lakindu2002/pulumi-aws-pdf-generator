import { Queues } from "./sqs";
import { apiGateway } from "./api";

export const dlqUrl = Queues.deadLetterQueue.url;
export const pdfProcessingQueueUrl = Queues.pdfProcessingQueue.url;
export const apiGatewayUrl = apiGateway.url;
