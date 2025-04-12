import express, { urlencoded, json } from "express";
import * as k8s from '@kubernetes/client-node';

const port = process.env.PORT || 8000;
const app = express();

app.use(urlencoded({ extended: true }));
app.use(json());
app.use(express.static('public'));

const kc = new k8s.KubeConfig();
kc.loadFromDefault(); // Uses ~/.kube/config or in-cluster config

const k8sApi = kc.makeApiClient(k8s.AppsV1Api);
const batchV1Api = kc.makeApiClient(k8s.BatchV1Api);

async function restartDeployment() {  
    const namespace = 'diaryapp';
    const deploymentName = 'diaryapp';
    try {
      // Get the existing deployment
      const deployment  = await k8sApi.readNamespacedDeployment({name: deploymentName, namespace});
  
      // Modify the deployment's annotation to trigger a restart
      const now = new Date().toISOString();
      const annotations = deployment.spec?.template?.metadata?.annotations || {};
      annotations['kubectl.kubernetes.io/restartedAt'] = now;
  
      deployment.spec!.template!.metadata!.annotations = annotations;
  
      // Patch the deployment with the updated annotations
      await k8sApi.replaceNamespacedDeployment({name: deploymentName, namespace, body: deployment});
      console.log(`Deployment '${deploymentName}' in namespace '${namespace}' restarted at ${now}`);
      return true;
    } catch (err) {
      console.error('Failed to restart deployment:', err);
      return false;
    }
}

async function triggerCronJob(cronJobName: string, namespace: string) {
    try {
        // Get the existing CronJob
        const cronJob = await batchV1Api.readNamespacedCronJob({name: cronJobName, namespace});

        // Create a new Job name
        const jobName = `${cronJob.metadata?.name}-manual-${Date.now()}`;

        // Create the Job spec from the CronJob's jobTemplate
        const jobSpec: k8s.V1Job = {
            metadata: {
                name: jobName,
                namespace: namespace,
            },
            spec: cronJob.spec?.jobTemplate.spec,
        }

        // Create the Job
        const createdJob = await batchV1Api.createNamespacedJob({namespace, body: jobSpec});
        console.log(`Successfully triggered job: ${createdJob.metadata?.name}`);
        return true;

    } catch (err) {
        console.error(`Failed to trigger CronJob '${cronJobName}':`, err);
        return false;
    }
}

app.get('/restart-deployment', async (req, res) => {
    let success = await restartDeployment()
    if (success) {
        res.status(200).send('Deployment restarted');
        return;
    } else {
        res.status(500).send(`Error: Could not restart deployment`);
    }
  });

app.get('/restore-orig', async (req, res) => {
    let success = await triggerCronJob("diary-restore-orig", "mongodb");
    if (success) {
        restartDeployment();
        res.status(200).send('Restored Original Version of Diary Data');
        return;
    } else {
        res.status(500).send(`Error: Could not restore original diary data`);
    }
  });

app.get('/restore-last', async (req, res) => {
    let success = await triggerCronJob("diary-restore-last", "mongodb");
    if (success) {
        restartDeployment();
        res.status(200).send('Restored Last Saved Version of Diary Data');
        return;
    } else {
        res.status(500).send(`Error: Could not restore last saved diary data`);
    }
  });

app.get('/backup', async (req, res) => {
    let success = await triggerCronJob("diary-backup-last", "mongodb");
    if (success) {
        res.status(200).send('Backup Version of Diary Data');
        return;
    } else {
        res.status(500).send(`Error: Could not backup diary data`);
    }
  });

app.listen(port, () => {
  console.log(`Server is listening at port ${port}`);
});