import { AppHeader } from './metagraph/components/AppHeader.tsx';
import { ErrorBanner } from './metagraph/components/ErrorBanner.tsx';
import { GlobalStyle } from './metagraph/components/GlobalStyle.tsx';
import { Sidebar } from './metagraph/components/Sidebar.tsx';
import { GovernanceSection } from './metagraph/sections/GovernanceSection.tsx';
import { IngestSection } from './metagraph/sections/IngestSection.tsx';
import { LineageSection } from './metagraph/sections/LineageSection.tsx';
import { RagSection } from './metagraph/sections/RagSection.tsx';
import { useMetagraphWorkspace } from './metagraph/useMetagraphWorkspace.ts';

export default function App() {
  const workspace = useMetagraphWorkspace();

  return (
    <div className="mg-root min-h-screen">
      <GlobalStyle />

      <AppHeader
        activeAccent={workspace.activeAccent}
        activeNav={workspace.activeNav}
        isPurging={workspace.isPurging}
        onPurge={workspace.handlePurge}
      />

      <div className="mx-auto flex min-h-[calc(100vh-97px)] max-w-7xl flex-col lg:flex-row">
        <Sidebar activeTab={workspace.activeTab} onSelectTab={workspace.setActiveTab} />

        <main className="mg-scroll min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <ErrorBanner error={workspace.error} onDismiss={() => workspace.setError('')} />

          {workspace.activeTab === 'ingest' && (
            <IngestSection
              catalog={workspace.catalog}
              ingestLogs={workspace.ingestLogs}
              isLoading={workspace.isLoading}
              isProcessing={workspace.isProcessing}
              onIngest={workspace.handleIngest}
              onSqlChange={workspace.setSqlInput}
              riskHits={workspace.riskHits}
              sqlInput={workspace.sqlInput}
              statementCount={workspace.statementCount}
            />
          )}

          {workspace.activeTab === 'lineage' && (
            <LineageSection
              catalog={workspace.catalog}
              graphData={workspace.graphData}
              isLoading={workspace.isLoading}
              onRefresh={workspace.loadWorkspace}
            />
          )}

          {workspace.activeTab === 'governance' && (
            <GovernanceSection
              catalog={workspace.catalog}
              governedSchema={workspace.governedSchema}
              isLoading={workspace.isLoading}
              piiCount={workspace.piiCount}
              selectedTable={workspace.selectedTable}
              setSelectedTable={workspace.setSelectedTable}
              setUserRole={workspace.setUserRole}
              userRole={workspace.userRole}
            />
          )}

          {workspace.activeTab === 'rag' && (
            <RagSection
              isSearching={workspace.isSearching}
              onQueryChange={workspace.setRagQuery}
              onSearch={workspace.handleSearch}
              ragQuery={workspace.ragQuery}
              ragResult={workspace.ragResult}
              setUserRole={workspace.setUserRole}
              suggestions={workspace.suggestions}
              userRole={workspace.userRole}
            />
          )}
        </main>
      </div>
    </div>
  );
}
