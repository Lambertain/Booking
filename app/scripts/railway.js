const https = require('https');

const TOKEN = '6f04a384-b4bd-4c8a-be9b-3d8286850c8d';

function gql(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: 'backboard.railway.app',
      path: '/graphql/v2',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        const j = JSON.parse(raw);
        if (j.errors) reject(new Error(JSON.stringify(j.errors)));
        else resolve(j.data);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === 'projects') {
    const d = await gql(`{ me { projects { edges { node { id name environments { edges { node { id name } } } services { edges { node { id name } } } } } } } }`);
    d.me.projects.edges.forEach(({ node: p }) => {
      console.log(`\nProject: ${p.name} (${p.id})`);
      p.environments.edges.forEach(({ node: e }) => console.log(`  Env: ${e.name} (${e.id})`));
      p.services.edges.forEach(({ node: s }) => console.log(`  Service: ${s.name} (${s.id})`));
    });
    return;
  }

  if (cmd === 'vars') {
    const [, projectId, environmentId, serviceId] = process.argv;
    const d = await gql(
      `query($projectId:String!,$environmentId:String!,$serviceId:String!){variables(projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId)}`,
      { projectId: process.argv[3], environmentId: process.argv[4], serviceId: process.argv[5] }
    );
    console.log(JSON.stringify(d.variables, null, 2));
    return;
  }

  if (cmd === 'set') {
    // node railway.js set projectId envId serviceId KEY VALUE
    const [,,, projectId, environmentId, serviceId, name, value] = process.argv;
    const d = await gql(
      `mutation($input:VariableUpsertInput!){variableUpsert(input:$input)}`,
      { input: { projectId, environmentId, serviceId, name, value } }
    );
    console.log('Set:', name, '=', value.slice(0, 20) + '...');
    return;
  }

  if (cmd === 'set-many') {
    // node railway.js set-many projectId envId serviceId '{"KEY":"val",...}'
    const [,,, projectId, environmentId, serviceId, jsonVars] = process.argv;
    const vars = JSON.parse(jsonVars);
    for (const [name, value] of Object.entries(vars)) {
      await gql(
        `mutation($input:VariableUpsertInput!){variableUpsert(input:$input)}`,
        { input: { projectId, environmentId, serviceId, name, value } }
      );
      console.log('Set:', name);
    }
    return;
  }

  console.log('Usage: node railway.js projects|vars|set|set-many ...');
}

main().catch(err => { console.error(err.message); process.exit(1); });
