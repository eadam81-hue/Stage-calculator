# Sample Excel Components File Format

## Excel File Structure

Your Excel file (.xlsx or .xls) should have the following structure:

### Row 1: Headers
```
Name | SKU | Quantity | Price | Weight | Width | Depth
```

### Row 2+: Component Data
```
Stage Deck Panel | SDK-001 | 50 | 150.00 | 50.00 | 2.44 | 1.22
Support Beam | SPB-100 | 100 | 95.50 | 35.20 | 0.15 | 2.00
Frame Connector | FRC-200 | 200 | 15.75 | 3.10 | 0.10 | 0.10
Outdoor Support Leg | OSL-040 | 40 | 180.00 | 85.50 | 0.20 | 0.20
Stage Riser | RSR-030 | 30 | 220.00 | 120.00 | 1.22 | 1.22
```

## Field Descriptions

- **Name**: Component name (text)
- **SKU**: Stock Keeping Unit / Product code (text, optional)
- **Quantity**: Available quantity in inventory (integer)
- **Price**: Price per unit in £ Sterling (decimal number)
- **Weight**: Weight per unit in kilograms (decimal number)
- **Width**: Width dimension in meters (decimal number)
- **Depth**: Depth dimension in meters (decimal number)

## Example Components

Here's an example of typical stage components:

| Name | SKU | Quantity | Price (£) | Weight (kg) | Width (m) | Depth (m) |
|------|-----|----------|-----------|-------------|-----------|-----------|
| Stage Deck Panel | SDK-001 | 50 | 150.00 | 50.00 | 2.44 | 1.22 |
| Support Beam | SPB-100 | 100 | 95.50 | 35.20 | 0.15 | 2.00 |
| Frame Connector | FRC-200 | 200 | 15.75 | 3.10 | 0.10 | 0.10 |
| Outdoor Support Leg | OSL-040 | 40 | 180.00 | 85.50 | 0.20 | 0.20 |
| Stage Riser | RSR-030 | 30 | 220.00 | 120.00 | 1.22 | 1.22 |
| Cross Brace | CRB-150 | 150 | 45.00 | 12.50 | 0.15 | 1.50 |
| Platform Deck | PLT-060 | 60 | 135.00 | 48.00 | 1.22 | 1.22 |

## Important Notes

- **Dimensions**: Width and Depth must be in meters. These are used by the calculator to determine optimal component quantities
- **SKU**: Optional but recommended for e-commerce integration
- **Price**: All prices in £ Sterling
- **Smart Calculation**: The system uses component dimensions to calculate how many pieces are needed to build the customer's stage
  - Example: If a customer needs a 12m × 10m stage, and deck panels are 2.44m × 1.22m, the calculator determines the optimal number
- For outdoor installations, the calculator applies a 1.2x multiplier for weather protection
- The calculation algorithm can be further customized with your specific equations
