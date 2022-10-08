import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import { Queues } from "../sqs";

const sqs = new aws.sdk.SQS({ region: "us-east-1" });

export const apiGateway = new awsx.apigateway.API("api", {
  routes: [
    {
      path: "/pdf",
      method: "POST",
      eventHandler: async (event) => {
        // client passes email and content to add to pdf
        const { email, content } = JSON.parse(event.body || "{}");

        // construct message to send to SQS
        const sqsParams = {
          MessageBody: JSON.stringify({ email, content }),
          QueueUrl: Queues.pdfProcessingQueue.url.get(),
        };

        // send message to SQS
        const resp = await sqs.sendMessage(sqsParams).promise();
        const { MessageId } = resp;

        // return message id to client for tracking purposes
        return { statusCode: 200, body: JSON.stringify({ MessageId }) };
      },
    },
  ],
  restApiArgs: {
    binaryMediaTypes: [],
  },
});
