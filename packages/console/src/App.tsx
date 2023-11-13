import { consoleClient, formConsolePrimaryKey } from '../triplit/client';
import { useQuery } from '@triplit/react';
import { useEffect, useMemo, useState } from 'react';
import {
  getProjectIdFromApiKey,
  JWTPayloadIsOfCorrectForm,
} from './utils/server';
import { Modal } from '@triplit/ui';
import {
  ImportProjectForm,
  ImportProjectFormValues,
  ProjectSelector,
  FullScreenWrapper,
  ProjectViewer,
  addProjectToConsole,
} from './components';
import { TriplitClient } from '@triplit/client';
import { useProjectState } from './components';
const projectClients = new Map<string, TriplitClient<any>>();

function App() {
  const [projectHint, setProjectHint] = useState<
    ImportProjectFormValues | undefined
  >(undefined);

  const [importModalIsOpen, setImportModalIsOpen] = useState(false);

  const [projectId, setProjectId] = useProjectState();

  const { results: projectEntities } = useQuery(
    consoleClient,
    consoleClient.query('projects')
  );

  // const userHasNoProjects = projectEntities && projectEntities.size === 0;
  useEffect(() => {
    (async () => {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      const token = params.get('token');
      if (!(token && JWTPayloadIsOfCorrectForm(token))) return;
      const server = params.get('server');
      if (!server) return;
      const projName = params.get('projName');
      const projectId = getProjectIdFromApiKey(token);
      const primaryKey = formConsolePrimaryKey(projectId, server);
      const existingProject = await consoleClient?.fetchById(
        'projects',
        primaryKey
      );
      if (!existingProject) {
        await addProjectToConsole({
          server,
          token,
          displayName: projName ?? 'triplit-project',
        });
      }
      setProjectId(primaryKey);
      window.history.replaceState({}, '', '/');
    })();
  }, []);

  const project = useMemo(() => {
    if (!(projectId && projectEntities)) return undefined;
    return projectEntities.get(projectId);
  }, [projectEntities, projectId]);

  const client = useMemo(() => {
    const savedClient = projectClients.get(projectId);
    if (savedClient) {
      savedClient?.syncEngine.connect();
      return savedClient;
    }
    if (!project) return;
    const { secure, server, token } = project;
    const newClient = new TriplitClient({
      serverUrl: `${secure ? 'https' : 'http'}://${server}`,
      token,
      syncSchema: true,
    });
    projectClients.set(projectId, newClient);
    return newClient;
  }, [project, projectId]);

  useEffect(() => {
    return () => {
      client?.syncEngine.disconnect();
    };
  }, [client]);

  if (!projectId || projectHint || !client)
    return (
      <FullScreenWrapper>
        <ProjectSelector
          onSelectProject={(id) => {
            setProjectId(id);
          }}
          onPressImportProject={() => {
            setImportModalIsOpen(true);
          }}
        />
        <Modal
          open={importModalIsOpen}
          onOpenChange={(open) => {
            setImportModalIsOpen(open);
            if (!open) setProjectHint(undefined);
          }}
          title="Import a project"
        >
          <ImportProjectForm
            projectHint={projectHint}
            onSubmit={async (values) => {
              try {
                const projectId = await addProjectToConsole(values);
                setProjectId(projectId);
                setImportModalIsOpen(false);
                setProjectHint(undefined);
              } catch (e) {
                console.error(e);
              }
            }}
          />
        </Modal>
      </FullScreenWrapper>
    );

  return (
    <ProjectViewer
      projectPrimaryKey={projectId}
      project={project}
      client={client}
    />
  );
}

export default App;
