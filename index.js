"use strict";

const
    AWS = require("aws-sdk"),
    codePipeline = new AWS.CodePipeline(),
    {deployPortfolio: portfolioDeployer} = require("./deploy-portfolio-lambda");


exports.handler = (event, context) => {
    let
        sourceBucket,
        sourceKey,
        job = event["CodePipeline.job"];

    if (job !== undefined) {
        console.log("Found a job");
        job["data"]["inputArtifacts"].forEach((artifact) => {
            console.log(`Processing artifact: ${artifact.name}`);
            if (artifact.name === "MyAppBuild") {
                let location = artifact["location"]["s3Location"];

                sourceBucket = location.bucketName;
                sourceKey = location.objectKey;

                console.log(`Setting bucket and key to: ${sourceBucket}/${sourceKey}`);
            }
        })
    } else {
        sourceBucket = event.Records[0].s3.bucket.name;
        sourceKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    }

    console.log(`Call PortfolioDeployer with: ${sourceBucket}/${sourceKey}`);
    portfolioDeployer(sourceBucket, sourceKey)
        .then(() => {
            console.log(`Inside successful then`);
            if (job !== undefined) {
                console.log(`Sending putJobSuccessResult`);
                codePipeline.putJobSuccessResult({jobId: job.id}).promise()
                    .then(() => {
                        console.log(`Sending putJobSuccessResult`);
                        context.succeed("Successfully Deployed")
                    })
                    .catch((err) => {
                        console.log(err.message);
                        context.fail("Failed to Deploy");
                    })
            }
        })
        .catch((err) => {
            if (job !== undefined) {
                let params = {
                    jobId: job.id,
                    failureDetails: {
                        message: JSON.stringify(err.message),
                        type: "JobFailed",
                        externalExecutionId: context.invokeid
                    }
                };
                console.log(`Sending putJobFailureResult: ${err}`);
                codePipeline.putJobFailureResult(params).promise()
                    .then(context.fail("Failed to Deploy"))
                    .catch((err) => {
                        console.log(err.message);
                        context.fail("Failed to Deploy");
                    })
            }
        });
};
