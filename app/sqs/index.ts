import * as aws from "@pulumi/aws";
import { pdfProcessingLambda } from '../lambda';

const deadLetterQueue = new aws.sqs.Queue("deadLetterQueue", {
    name: "deadLetterQueue",
    visibilityTimeoutSeconds: 120, // 2 minutes visibility timeout
    messageRetentionSeconds: 1209600, // remove messages in DLQ after 14 days
});

const pdfProcessingQueue = new aws.sqs.Queue("pdfProcessingQueue", {
    name: "pdfProcessingQueue",
    // 1 minute visibility timeout for processing
    // within 1 minute -> create PDF, upload to S3, send message, delete message from queue
    // else it will be visible again and can cause double `
    visibilityTimeoutSeconds: 60,
    messageRetentionSeconds: 86400, // remove messages in queue after 24 hours
    fifoQueue: false,
    delaySeconds: 10, // delay message for 10 seconds to avoid possible lambda limits.
    redrivePolicy: deadLetterQueue.arn.apply((arn) => JSON.stringify({
        deadLetterTargetArn: arn,
        maxReceiveCount: 3,
    }))
});

pdfProcessingQueue.onEvent("pdfProcessingQueueEvent", pdfProcessingLambda);

export const Queues = {
    deadLetterQueue,
    pdfProcessingQueue,
};
