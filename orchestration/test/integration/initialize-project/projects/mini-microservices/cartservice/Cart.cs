namespace CartService;

public record CartItem(string ProductId, int Quantity);

public class Cart
{
    public string UserId { get; init; } = "";
    public List<CartItem> Items { get; init; } = new();

    public int TotalQuantity() => Items.Sum(i => i.Quantity);

    public void Add(CartItem item)
    {
        var existing = Items.FirstOrDefault(i => i.ProductId == item.ProductId);
        if (existing is null)
        {
            Items.Add(item);
        }
        else
        {
            Items.Remove(existing);
            Items.Add(existing with { Quantity = existing.Quantity + item.Quantity });
        }
    }
}
