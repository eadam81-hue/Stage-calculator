import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CalculationHistory = () => {
  const navigate = useNavigate();
  const [calculations, setCalculations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCalculations();
  }, []);

  const fetchCalculations = async () => {
    try {
      const response = await axios.get(`${API}/calculations`);
      setCalculations(response.data);
    } catch (error) {
      console.error("Error fetching calculations:", error);
      toast.error("Failed to load calculation history");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-4"
            data-testid="back-btn"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Calculator
          </Button>
          <h1 className="text-5xl font-bold gradient-text mb-2">Calculation History</h1>
          <p className="text-slate-600 text-lg">Review your previous stage calculations</p>
        </div>

        {/* History */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-cyan-600" />
              Previous Calculations
            </CardTitle>
            <CardDescription>
              {calculations.length} calculation(s) saved
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
              </div>
            ) : calculations.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 text-lg">No calculations yet</p>
                <p className="text-slate-400 text-sm mb-4">Start calculating stages to see history</p>
                <Button onClick={() => navigate('/')} data-testid="go-calculator-btn">
                  Go to Calculator
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {calculations.map((calc, index) => (
                  <Card key={calc.id} className="border-2" data-testid={`calc-card-${index}`}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">
                            Stage: {calc.width}m × {calc.depth}m × {calc.height}m
                          </CardTitle>
                          <CardDescription>
                            {format(new Date(calc.created_at), "PPpp")}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={calc.location_type === "outdoor" ? "default" : "secondary"}
                          data-testid={`location-badge-${index}`}
                        >
                          {calc.location_type}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <p className="text-sm text-slate-500">Volume</p>
                          <p className="text-lg font-semibold">
                            {(calc.width * calc.depth * calc.height).toFixed(2)}m³
                          </p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <p className="text-sm text-slate-500">Parts</p>
                          <p className="text-lg font-semibold">{calc.parts_list.length}</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <p className="text-sm text-slate-500">Total Price</p>
                          <p className="text-lg font-semibold">£{calc.total_price.toFixed(2)}</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg">
                          <p className="text-sm text-slate-500">Total Weight</p>
                          <p className="text-lg font-semibold">{calc.total_weight.toFixed(2)} kg</p>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Part</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Price</TableHead>
                              <TableHead className="text-right">Weight</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {calc.parts_list.map((part, partIndex) => (
                              <TableRow key={partIndex}>
                                <TableCell className="font-medium">{part.name}</TableCell>
                                <TableCell className="text-right">{part.quantity_used}</TableCell>
                                <TableCell className="text-right">£{part.total_price.toFixed(2)}</TableCell>
                                <TableCell className="text-right">{part.total_weight.toFixed(2)} kg</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CalculationHistory;