import { useState } from 'react';
import { Modal } from '@triplit/ui';
import {
  ImportServerForm,
  ServerSelector,
  FullScreenWrapper,
} from './components';
import { useNavigate } from 'react-router-dom';
import { addServerToConsole } from './utils/server.js';

function App() {
  const navigate = useNavigate();
  const [importModalIsOpen, setImportModalIsOpen] = useState(false);

  return (
    <FullScreenWrapper>
      <ServerSelector
        handleImportServer={() => {
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
        <ImportServerForm
          onSubmit={async (values) => {
            try {
              const projectId = await addServerToConsole(values);
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
