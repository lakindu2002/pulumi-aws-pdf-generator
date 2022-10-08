import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const pdfLayer = new aws.lambda.LayerVersion("pdfLayer", {
    layerName: "pdfLayer",
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("./lambda/layer/chrome_aws_lambda.zip"),
    }),
    compatibleRuntimes: [aws.lambda.Runtime.NodeJS16dX],
});

export const pdfProcessingLambda = new aws.lambda.CallbackFunction("pdfProcessingLambda", {
    callback: async (event: aws.sqs.QueueEvent) => { },
    memorySize: 3072,
    runtime: aws.lambda.Runtime.NodeJS16dX,
    timeout: 30,
    layers: [pdfLayer.arn]
});