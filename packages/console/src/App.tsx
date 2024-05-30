import { useState } from 'react';
import { initializeFromUrl } from './utils/project';
import { Modal } from '@triplit/ui';
import {
  ImportProjectForm,
  ProjectSelector,
  FullScreenWrapper,
} from './components';
import { useNavigate } from 'react-router-dom';
import { addProjectToConsole } from './utils/project.js';

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
