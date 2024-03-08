import { consoleClient } from '../triplit/client';
import { useState } from 'react';
import { JWTPayloadIsOfCorrectForm } from './utils/server';
import { Modal } from '@triplit/ui';
import {
  ImportProjectForm,
  ProjectSelector,
  FullScreenWrapper,
  addProjectToConsole,
} from './components';
import { useNavigate } from 'react-router-dom';

async function initializeFromUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const token = params.get('token');
  if (!(token && JWTPayloadIsOfCorrectForm(token))) return;
  const server = params.get('server');
  if (!server) return;
  const projName = params.get('projName');
  const projId = await addProjectToConsole({
    server,
    token,
    displayName: projName ?? 'triplit-project',
  });
  window.location.href = '/' + projId;
}

initializeFromUrl();

function App() {
  const navigate = useNavigate();
  const [importModalIsOpen, setImportModalIsOpen] = useState(false);

  return (
    <FullScreenWrapper>
      <ProjectSelector
        onPressImportProject={() => {
          setImportModalIsOpen(true);
        }}
      />
      <Modal
        open={importModalIsOpen}
        onOpenChange={(open) => {
          setImportModalIsOpen(open);
        }}
        title="Import a project"
      >
        <ImportProjectForm
          onSubmit={async (values) => {
            try {
              const projectId = await addProjectToConsole(values);
              navigate('/' + projectId);
              setImportModalIsOpen(false);
            } catch (e) {
              console.error(e);
            }
          }}
        />
      </Modal>
    </FullScreenWrapper>
  );
}

export default App;
