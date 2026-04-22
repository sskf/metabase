const { H } = cy;

import { useMetabot } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import { signInAsAdminAndEnableEmbeddingSdk } from "e2e/support/helpers/embedding-sdk-testing";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const query = {
  "source-table": ORDERS_ID,
  aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
  breakout: [["field", ORDERS.PRODUCT_ID, null]],
  limit: 2,
};
const adHocQuestionPath = `/question#${btoa(
  JSON.stringify({
    dataset_query: { database: 1, type: "query", query },
    display: "table",
    displayIsLocked: true,
    visualization_settings: {},
  }),
)}`;

const metabotResponseWithNavigateTo = `0:"Here is the [question link](${adHocQuestionPath})"
2:{"type":"navigate_to","version":1,"value":"${adHocQuestionPath}"}`;

const MetabotConsumer = () => {
  const metabot = useMetabot();

  if (!metabot) {
    return <div data-testid="metabot-loading">loading</div>;
  }

  return (
    <div data-testid="metabot-consumer">
      <button
        data-testid="metabot-send"
        type="button"
        onClick={() => {
          void metabot.submitMessage("Show me orders");
        }}
      >
        Send
      </button>

      <ul data-testid="metabot-messages">
        {metabot.messages.map((message) => (
          <li key={message.id} data-testid={`metabot-message-${message.role}`}>
            {message.type === "text" ? message.message : "chart"}
          </li>
        ))}
      </ul>

      {metabot.CurrentChart && (
        <div data-testid="metabot-current-chart">
          <metabot.CurrentChart />
        </div>
      )}
    </div>
  );
};

describe("scenarios > embedding-sdk > use-metabot hook", () => {
  beforeEach(() => {
    signInAsAdminAndEnableEmbeddingSdk();
    H.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");

    H.mockMetabotResponse({
      statusCode: 200,
      body: metabotResponseWithNavigateTo,
    });

    // Catch-all intercept to see if ANY request goes to metabot endpoints.
    cy.intercept("POST", "**/api/metabot/**").as("anyMetabotCall");

    cy.signOut();
    mockAuthProviderAndJwtSignIn();
  });

  it("exposes Metabot under a bare MetabaseProvider and renders CurrentChart after navigate_to", () => {
    mountSdkContent(<MetabotConsumer />);

    getSdkRoot().within(() => {
      cy.findByTestId("metabot-consumer").should("exist");
      cy.findByTestId("metabot-send").click();
    });

    cy.wait("@metabotAgent", { timeout: 20_000 });

    getSdkRoot().within(() => {
      cy.findAllByTestId("metabot-message-agent").should(
        "have.length.at.least",
        1,
      );
      cy.findByTestId("metabot-current-chart").should("exist");
      cy.findByTestId("visualization-root").should("exist");
    });
  });
});
