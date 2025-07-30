import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { schemaStore } from "@/schema-store.js";
import { createTestMcpServer, createTestConfig, suppressConsole, callMcpTool } from "@tests/utils/test-helpers.js";
import { registerAllTools } from "@/tools/register-tools.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("get_headers tool - Format Testing", () => {
  let restoreConsole: () => void;
  let server: any;

  beforeEach(async () => {
    restoreConsole = suppressConsole();
    schemaStore.clearSchema();
    server = createTestMcpServer();

    // Load the headers edge cases test spec
    const specPath = resolve(__dirname, "../data/headers-edge-cases.yaml");
    await schemaStore.loadSchema(specPath);

    // Register tools
    const config = createTestConfig();
    registerAllTools(server, config);
  });

  afterEach(() => {
    restoreConsole();
    schemaStore.clearSchema();
  });

  describe("Type Formatting", () => {
    it("should format headers with enum values correctly", async () => {
      // Arrange
      const args = { operation_id: "complexHeaders", compact: true };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      expect(result.content[0].text).toContain("X-Enum-Header");
      expect(result.content[0].text).toContain("(string (value1 | value2 | value3))");
      expect(result.content[0].text).toContain("Enum values");
    });

    it("should format headers with pattern constraints", async () => {
      // Arrange
      const args = { operation_id: "complexHeaders", compact: false };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      expect(result.content[0].text).toContain("X-Pattern-Header");
      expect(result.content[0].text).toContain("Type: string");
      expect(result.content[0].text).toContain("Pattern constraint");
    });

    it("should format headers with min/max constraints", async () => {
      // Arrange
      const args = { operation_id: "complexHeaders", status_code: "200", compact: false };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      expect(result.content[0].text).toContain("X-MinMax-Header");
      expect(result.content[0].text).toContain("Type: integer");
      expect(result.content[0].text).toContain("Min/max constraint");
    });

    it("should format array type headers", async () => {
      // Arrange
      const args = { operation_id: "complexHeaders", compact: true };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      expect(result.content[0].text).toContain("X-Array-Header");
      expect(result.content[0].text).toContain("(array[string])");
      expect(result.content[0].text).toContain("Array of strings");
    });

    it("should format object type headers", async () => {
      // Arrange
      const args = { operation_id: "complexHeaders", compact: true };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      expect(result.content[0].text).toContain("X-Object-Header");
      expect(result.content[0].text).toContain("(object)");
      expect(result.content[0].text).toContain("Object header");
    });

    it("should handle headers with $ref schemas", async () => {
      // Arrange
      const args = { operation_id: "malformedHeaders", compact: true };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      expect(result.content[0].text).toContain("X-No-Schema");
      expect(result.content[0].text).toContain("(unknown)");
      expect(result.content[0].text).toContain("X-Empty-Schema");
      expect(result.content[0].text).toContain("(unknown)");
    });
  });

  describe("Compact Mode", () => {
    it("should show inline format in compact mode", async () => {
      // Arrange
      const args = { operation_id: "complexHeaders", status_code: "200", compact: true };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      const text = result.content[0].text;
      // Check inline format: **Header-Name** (type, format): description
      expect(text).toMatch(/- \*\*X-Array-Header\*\* \(array\[string\]\): Array of strings/);
      expect(text).toMatch(/- \*\*X-Object-Header\*\* \(object\): Object header/);
      expect(text).toMatch(/- \*\*X-Enum-Header\*\* \(string \(value1 \| value2 \| value3\)\): Enum values/);
    });

    it("should show detailed format in non-compact mode", async () => {
      // Arrange
      const args = { operation_id: "complexHeaders", status_code: "200", compact: false };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      const text = result.content[0].text;
      // Check detailed format with separate lines
      expect(text).toContain("- **X-Array-Header**\n");
      expect(text).toContain("  - Type: array[string]\n");
      expect(text).toContain("  - Description: Array of strings\n");

      expect(text).toContain("- **X-Object-Header**\n");
      expect(text).toContain("  - Type: object\n");
      expect(text).toContain("  - Description: Object header\n");
    });

    it("should handle long descriptions in compact mode", async () => {
      // Arrange
      const args = { operation_id: "securityHeaders", status_code: "200", compact: true };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      const text = result.content[0].text;
      // Descriptions should be on the same line in compact mode
      expect(text).toMatch(/- \*\*X-Content-Type-Options\*\* \(string \(nosniff\)\): Prevents MIME type sniffing/);
      expect(text).toMatch(/- \*\*Content-Security-Policy\*\* \(string\): CSP directives/);
    });

    it("should properly escape special characters in compact mode", async () => {
      // Arrange
      const args = { operation_id: "statusVariations", status_code: "401", compact: true };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      const text = result.content[0].text;
      // WWW-Authenticate header should be properly escaped
      expect(text).toContain("**WWW-Authenticate**");
      expect(text).toContain("Authentication challenge");
    });
  });

  describe("Required Headers", () => {
    it("should display required field when present", async () => {
      // Arrange
      const args = { operation_id: "requiredHeaders", status_code: "200", compact: false };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      const text = result.content[0].text;
      // X-Required-True should show Required: Yes
      expect(text).toContain("- **X-Required-True**");
      expect(text).toContain("  - Required: Yes");
    });

    it("should not display required field when absent", async () => {
      // Arrange
      const args = { operation_id: "requiredHeaders", status_code: "200", compact: false };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      const text = result.content[0].text;
      // X-No-Required should not have a Required line
      const noRequiredSection = text.substring(
        text.indexOf("- **X-No-Required**"),
        text.indexOf("\n\n", text.indexOf("- **X-No-Required**")),
      );
      expect(noRequiredSection).not.toContain("Required:");
    });

    it("should handle required: true correctly", async () => {
      // Arrange
      const args = { operation_id: "requiredHeaders", status_code: "200", compact: false };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      const text = result.content[0].text;
      // X-Required-True with required: true
      expect(text).toContain("- **X-Required-True**");
      expect(text).toContain("  - Required: Yes");
      expect(text).toContain("  - Description: Explicitly required");
    });

    it("should handle required: false correctly", async () => {
      // Arrange
      const args = { operation_id: "requiredHeaders", status_code: "200", compact: false };

      // Act
      const result = await callMcpTool(server, "get_headers", args);

      // Assert
      const text = result.content[0].text;
      // X-Required-False with required: false
      expect(text).toContain("- **X-Required-False**");
      expect(text).not.toContain("  - Required: No"); // Tool only shows Required when it's true
      expect(text).toContain("  - Description: Explicitly not required");
    });
  });
});
