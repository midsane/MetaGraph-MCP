import { AppHeader } from './metagraph/components/AppHeader.tsx';
import { ErrorBanner } from './metagraph/components/ErrorBanner.tsx';
import { GlobalStyle } from './metagraph/components/GlobalStyle.tsx';
import { AskSection } from './metagraph/sections/AskSection.tsx';
import { BusinessDbSection } from './metagraph/sections/BusinessDbSection.tsx';
import { ContextLayerSection } from './metagraph/sections/ContextLayerSection.tsx';
import { useMetagraphWorkspace } from './metagraph/useMetagraphWorkspace.ts';

export default function App() {
  const workspace = useMetagraphWorkspace();

  return (
    <div className="mg-root min-h-screen">
      <GlobalStyle />

      <AppHeader
        activeTab={workspace.activeTab}
        isPurging={workspace.isPurging}
        onPurge={workspace.handlePurge}
        onSelectTab={workspace.setActiveTab}
      />

      <main className="mg-scroll mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-10">
        <ErrorBanner error={workspace.error} onDismiss={() => workspace.setError('')} />

        {workspace.activeTab === 'business-db' && (
          <BusinessDbSection
            actionLog={workspace.actionLog}
            businessDbTables={workspace.businessDbTables}
            isLoading={workspace.isLoading}
            isProcessing={workspace.isProcessing}
            isSyncing={workspace.isSyncing}
            onExec={workspace.handleExec}
            onSqlChange={workspace.setSqlInput}
            onSyncNow={workspace.handleSyncNow}
            riskHits={workspace.riskHits}
            sqlInput={workspace.sqlInput}
            statementCount={workspace.statementCount}
          />
        )}

        {workspace.activeTab === 'context-layer' && (
          <ContextLayerSection
            catalogDbTables={workspace.catalogDbTables}
            downstream={workspace.downstreamOfSelected}
            graphData={workspace.graphData}
            isLoading={workspace.isLoading}
            onSelectAsset={workspace.setSelectedAssetName}
            piiColumnCount={workspace.piiColumnCount}
            selectedAsset={workspace.selectedAsset}
            selectedAssetName={workspace.selectedAssetName}
            syncWatermark={workspace.syncWatermark}
            upstream={workspace.upstreamOfSelected}
          />
        )}

        {workspace.activeTab === 'ask' && (
          <AskSection
            chatMessages={workspace.chatMessages}
            isSearching={workspace.isSearching}
            onNewChat={workspace.handleNewChat}
            onQueryChange={workspace.setRagQuery}
            onSendMessage={workspace.handleSendMessage}
            ragQuery={workspace.ragQuery}
            setUserRole={workspace.setUserRole}
            suggestions={workspace.suggestions}
            userRole={workspace.userRole}
          />
        )}
      </main>
    </div>
  );
}
