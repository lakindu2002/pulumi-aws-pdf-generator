import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { Queues } from "../sqs";
import { pdfBucket } from "../s3";
import { ManagedPolicies } from "@pulumi/aws/iam";

const config = new pulumi.Config();
const senderEmail = config.require('sender-email');

const pdfLayer = new aws.lambda.LayerVersion("pdfLayer", {
  layerName: "pdfLayer",
  code: new pulumi.asset.AssetArchive({
    "": new pulumi.asset.FileArchive("./lambda/layer/chrome_aws_lambda.zip"),
  }),
  compatibleRuntimes: [aws.lambda.Runtime.NodeJS14dX],
});

const sqs = new aws.sdk.SQS({ region: "us-east-1" });

const generatePdf = async (content: string): Promise<Buffer> => {
  const chromium = require('chrome-aws-lambda');
  let browser: any = undefined;
  try {
    // launch a headless chrome instance
    const executablePath = await chromium.executablePath;
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    // create a new page
    const page = await browser.newPage();
    const html = `<h1> Hi! Here is a copy of your PDF Content that you requested!</h1> <br/> <hr/> <p> ${content} </p>`;
    // set the content of the page
    await page.setContent(html);

    // generate the pdf as a buffer and return it
    return (await page.pdf({ format: "A4" })) as Buffer;
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    if (browser !== undefined) {
      // close the browser
      await browser.close();
    }
  }
};

export const pdfProcessingLambda = new aws.lambda.CallbackFunction("pdfProcessingLambda", {
  callback: async (event: aws.sqs.QueueEvent) => {
    const processedEventPromises = event.Records.map(async (record) => {
      const { messageId, body, receiptHandle } = record;
      const { content, email } = JSON.parse(body) as {
        email: string;
        content: string;
      };

      // generate pdf
      const pdf = await generatePdf(content);

      const pdfName = `${messageId}.pdf`;

      // upload pdf to s3
      const s3 = new aws.sdk.S3({ region: "eu-central-1" });
      await s3.putObject({
        Bucket: pdfBucket.bucket.get(),
        Key: `pdf/${pdfName}`,
        Body: pdf,
        ContentType: "application/pdf",
      }).promise();

      // generate signed url from s3 for public reads.
      const signedUrl = await s3.getSignedUrlPromise("getObject", {
        Bucket: pdfBucket.bucket.get(),
        Key: `pdf/${pdfName}`,
        Expires: 60 * 60 * 24 * 7, // 7 days
      });

      // send email with signed url
      const ses = new aws.sdk.SES({ region: "us-east-1" });
      await ses.sendEmail({
        Source: senderEmail,
        Destination: { ToAddresses: [email], },
        Message: {
          Body: { Html: { Charset: "UTF-8", Data: `Your pdf is ready. <a href="${signedUrl}">Download</a>`, }, },
          Subject: { Data: "Your pdf is ready", Charset: "UTF-8" },
        },
      }).promise();

      // delete message from queue
      await sqs.deleteMessage({ QueueUrl: Queues.pdfProcessingQueue.url.get(), ReceiptHandle: receiptHandle }).promise();
      console.log(`Deleted message ${messageId} from queue`);
    });
    await Promise.all(processedEventPromises);
  },
  memorySize: 3072,
  runtime: aws.lambda.Runtime.NodeJS14dX,
  timeout: 30,
  layers: [pdfLayer.arn],
  policies: [ManagedPolicies.AmazonSESFullAccess, ManagedPolicies.AmazonS3FullAccess, ManagedPolicies.AmazonSQSFullAccess, ManagedPolicies.AWSLambdaBasicExecutionRole, ManagedPolicies.CloudWatchFullAccess],
});
