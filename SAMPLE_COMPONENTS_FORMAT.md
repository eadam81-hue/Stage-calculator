# Sample Excel Components File Format

## Excel File Structure

Your Excel file (.xlsx or .xls) should have the following structure:

### Row 1: Headers
```
Name | Quantity | Price | Weight
```

### Row 2+: Component Data
```
Stage Deck Panel | 50 | 150.00 | 50.00
Support Beam | 100 | 95.50 | 35.20
Frame Connector | 200 | 15.75 | 3.10
Outdoor Support Leg | 40 | 180.00 | 85.50
Stage Riser | 30 | 220.00 | 120.00
```

## Field Descriptions

- **Name**: Component name (text)
- **Quantity**: Available quantity in inventory (integer)
- **Price**: Price per unit in dollars (decimal number)
- **Weight**: Weight per unit in kilograms (decimal number)

## Example Components

Here's an example of typical stage components:

| Name | Quantity | Price | Weight |
|------|----------|-------|--------|
| Stage Deck Panel | 50 | 150.00 | 50.00 |
| Support Beam | 100 | 95.50 | 35.20 |
| Frame Connector | 200 | 15.75 | 3.10 |
| Outdoor Support Leg | 40 | 180.00 | 85.50 |
| Stage Riser | 30 | 220.00 | 120.00 |
| Cross Brace | 150 | 45.00 | 12.50 |
| Platform Deck | 60 | 135.00 | 48.00 |

## Notes

- The system will automatically detect component types based on names (deck, support, frame, etc.)
- For outdoor installations, the calculator applies a 1.2x multiplier for weather protection
- The calculation algorithm can be customized with your specific equations
- Currently uses a placeholder algorithm until you provide your custom formulas
