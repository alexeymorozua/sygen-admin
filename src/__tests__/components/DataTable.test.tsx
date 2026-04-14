import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DataTable, { type Column } from "@/components/DataTable";

interface TestRow {
  id: string;
  name: string;
  status: string;
}

const columns: Column<TestRow>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "status", label: "Status", sortable: true },
];

const data: TestRow[] = [
  { id: "1", name: "Alpha", status: "active" },
  { id: "2", name: "Charlie", status: "paused" },
  { id: "3", name: "Bravo", status: "error" },
];

describe("DataTable", () => {
  it("renders rows correctly", () => {
    render(<DataTable data={data} columns={columns} keyField="id" />);

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("sorts by column when header clicked", () => {
    render(<DataTable data={data} columns={columns} keyField="id" />);

    // Click "Name" header to sort ascending
    fireEvent.click(screen.getByText("Name"));

    const rows = screen.getAllByRole("row");
    // rows[0] is the header row, data starts at rows[1]
    expect(rows[1]).toHaveTextContent("Alpha");
    expect(rows[2]).toHaveTextContent("Bravo");
    expect(rows[3]).toHaveTextContent("Charlie");

    // Click again to sort descending
    fireEvent.click(screen.getByText("Name"));
    const rowsDesc = screen.getAllByRole("row");
    expect(rowsDesc[1]).toHaveTextContent("Charlie");
    expect(rowsDesc[2]).toHaveTextContent("Bravo");
    expect(rowsDesc[3]).toHaveTextContent("Alpha");
  });

  it("paginates data correctly", () => {
    // Generate 15 rows
    const bigData: TestRow[] = Array.from({ length: 15 }, (_, i) => ({
      id: String(i),
      name: `Item ${String(i).padStart(2, "0")}`,
      status: "active",
    }));

    render(<DataTable data={bigData} columns={columns} keyField="id" pageSize={5} />);

    // First page should show items 0-4
    expect(screen.getByText("Item 00")).toBeInTheDocument();
    expect(screen.getByText("Item 04")).toBeInTheDocument();
    expect(screen.queryByText("Item 05")).not.toBeInTheDocument();

    // Shows pagination info
    expect(screen.getByText("1-5 of 15")).toBeInTheDocument();

    // Navigate to next page
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(screen.getByText("Item 05")).toBeInTheDocument();
    expect(screen.getByText("6-10 of 15")).toBeInTheDocument();
  });

  it("resets page on data change", () => {
    const { rerender } = render(
      <DataTable
        data={Array.from({ length: 15 }, (_, i) => ({
          id: String(i),
          name: `Item ${i}`,
          status: "active",
        }))}
        columns={columns}
        keyField="id"
        pageSize={5}
      />
    );

    // Go to page 2
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(screen.getByText("6-10 of 15")).toBeInTheDocument();

    // Rerender with different data length → page resets
    rerender(
      <DataTable
        data={[{ id: "1", name: "Only One", status: "ok" }]}
        columns={columns}
        keyField="id"
        pageSize={5}
      />
    );

    expect(screen.getByText("Only One")).toBeInTheDocument();
  });

  it("renders custom cell via render function", () => {
    const customColumns: Column<TestRow>[] = [
      {
        key: "name",
        label: "Name",
        render: (item) => <strong data-testid="custom">{item.name.toUpperCase()}</strong>,
      },
    ];

    render(<DataTable data={data} columns={customColumns} keyField="id" />);

    expect(screen.getByText("ALPHA")).toBeInTheDocument();
    expect(screen.getAllByTestId("custom")).toHaveLength(3);
  });

  it("calls onRowClick when a row is clicked", () => {
    const onClick = vi.fn();
    render(<DataTable data={data} columns={columns} keyField="id" onRowClick={onClick} />);

    fireEvent.click(screen.getByText("Alpha"));
    expect(onClick).toHaveBeenCalledWith(data[0]);
  });
});
